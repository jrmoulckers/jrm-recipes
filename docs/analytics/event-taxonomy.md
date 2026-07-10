# Event taxonomy

Heirloom's product analytics taxonomy lives in `src/lib/analytics/events.ts`.
That file is the single source of truth for every event name and its property
shape. The browser `track()` API in `src/lib/analytics/index.ts` and the server
`captureServer()` API in `src/lib/analytics/server.ts` are typed against
`EventProperties`, so a misnamed event or wrong property fails at compile time.
This prevents drift such as `recipe_created` vs. `create_recipe`.

## Naming and property conventions

- Event names are `snake_case`.
- Product events use object-verb names, usually past tense:
  `recipe_created`, `invite_sent`, `cook_completed`.
- PostHog-reserved events/properties keep the `$` prefix:
  `$pageview`, `$feature_flag_called`, `$current_url`,
  `$feature_flag`, `$feature_flag_response`.
- No PII in event properties: no emails, names, handles, phone numbers, or raw
  person identifiers. Recipe and group ids are opaque cuids and are allowed.
- User identity is attached only through server-side identify work (#321), using
  non-PII traits from `src/lib/analytics/identity.ts`: `group_count`,
  `has_recipes`, `is_dev`, `created_at`, and `household_active`.
- Prefer low-cardinality enums, counts, booleans, and coarse buckets. The
  `GroupSizeBucket` type (`"1" | "2-5" | "6-10" | "11+"`) is the pattern for
  measuring family size without making it identifying.
- `householdId` follows the nullable household pattern from
  `docs/analytics/retention.md`: the recipe's owning group id, or `null` for a
  personal recipe.

## Capture, consent, and scrubbing

Browser capture flows through `track()` in `src/lib/analytics/index.ts`; server
capture flows through `captureServer()` in `src/lib/analytics/server.ts`. Both
paths scrub properties with `src/lib/analytics/scrub.ts` before dispatch.
Scrubbing drops keys that look identifying, except allowlisted PostHog fields,
and redacts email- or phone-like string values.

Capture is gated by consent before data leaves the app. The browser gate is
`isCaptureAllowed()` in `src/lib/analytics/consent.ts`: DNT/GPC always blocks,
explicit denial blocks, opt-in mode requires explicit grant, and opt-out mode
allows capture unless denied. Server capture uses the server consent gate called
from `src/lib/analytics/server.ts`. If analytics is not configured,
`src/lib/analytics/config.ts` and `src/lib/analytics/backend.ts` make all capture
a safe no-op.

For metric context, see `docs/analytics/activation.md` for activation and
`docs/analytics/retention.md` for returning-cook retention.

## Complete event reference

Types below are copied from `EventProperties` in `src/lib/analytics/events.ts`.
Current call sites are in the paths named in the "When it fires" column.

### Pageviews and navigation

| Event       | Properties                                 | When it fires                                                                                                                                            |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview` | `pathname: string`; `$current_url: string` | On initial load and App Router client navigation in `src/components/analytics/pageview-tracker.tsx`; paths are normalized and query strings are dropped. |

### Recipe creation and editing funnel

| Event                | Properties                                                                                                                                      | When it fires                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `recipe_created`     | `recipeId: string`; `ingredientCount: number`; `stepCount: number`; `hasPhoto: boolean`; `visibility: RecipeVisibility`; `source: RecipeSource` | After `createRecipeAction` creates a recipe in `src/server/recipes/actions.ts`. Current source is `"manual"`. |
| `recipe_updated`     | `recipeId: string`; `ingredientCount: number`; `stepCount: number`; `hasPhoto: boolean`; `visibility: RecipeVisibility`                         | After `updateRecipeAction` updates an existing recipe in `src/server/recipes/actions.ts`.                     |
| `recipe_deleted`     | `recipeId: string`                                                                                                                              | After `deleteRecipeAction` deletes a recipe in `src/server/recipes/actions.ts`.                               |
| `recipe_forked`      | `recipeId: string`; `sourceId: string`                                                                                                          | After `forkRecipeAction` / `createAdaptationAction` creates an adaptation in `src/server/recipes/actions.ts`. |
| `recipe_reverted`    | `recipeId: string`; `versionNumber: number`                                                                                                     | After `revertRecipeAction` restores a saved version in `src/server/recipes/actions.ts`.                       |
| `recipe_imported`    | `ok: boolean`                                                                                                                                   | After URL import succeeds/fails, or text import succeeds, in `src/server/recipes/actions.ts`.                 |
| `editor_opened`      | `mode: "create" \| "edit"`                                                                                                                      | When the recipe editor mounts in `src/components/recipe/recipe-editor.tsx`.                                   |
| `editor_save_failed` | `mode: "create" \| "edit"`; `fieldCount: number`                                                                                                | When the editor receives a failed create/update result in `src/components/recipe/recipe-editor.tsx`.          |

### Cook Mode lifecycle

| Event                      | Properties                                                                                    | When it fires                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `cook_started`             | `recipeId: string`; `totalSteps: number`; `householdId: string \| null`                       | Once per Cook Mode session, deduped across reloads, in `src/components/cook/use-cook-session.ts`.                  |
| `cook_step_advanced`       | `recipeId: string`; `stepIndex: number`; `totalSteps: number`                                 | When the cook advances to a later step in `src/components/cook/use-cook-session.ts`.                               |
| `cook_completed`           | `recipeId: string`; `totalSteps: number`; `durationMs: number`; `householdId: string \| null` | When the cook reaches the final step for the first time in a session in `src/components/cook/use-cook-session.ts`. |
| `cook_timer_started`       | `recipeId: string`                                                                            | When a step timer is started in `src/components/cook/use-cook-session.ts`.                                         |
| `cook_timer_completed`     | `recipeId: string`                                                                            | Once per timer when it completes in `src/components/cook/use-cook-session.ts`.                                     |
| `cook_servings_scaled`     | `recipeId: string`; `servings: number`                                                        | When servings are changed in Cook Mode in `src/components/cook/use-cook-session.ts`.                               |
| `cook_unit_system_changed` | `recipeId: string`; `system: CookUnitSystem`                                                  | When the Cook Mode unit system changes in `src/components/cook/use-cook-session.ts`.                               |

### Share and reel virality loop

| Event                   | Properties                                         | When it fires                                                                                                    |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `recipe_shared`         | `method: ShareMethod`                              | When a recipe is shared by file, native share sheet, or copied link in `src/components/recipe/share-button.tsx`. |
| `share_card_downloaded` | `Record<string, never>`                            | When the share card image is downloaded in `src/components/recipe/share-button.tsx`.                             |
| `share_link_copied`     | `Record<string, never>`                            | After the recipe share link text is copied in `src/components/recipe/share-button.tsx`.                          |
| `share_link_disabled`   | `Record<string, never>`                            | After an owner disables a share link in `src/components/recipe/share-button.tsx`.                                |
| `share_link_rotated`    | `Record<string, never>`                            | After an owner rotates/resets a share link in `src/components/recipe/share-button.tsx`.                          |
| `reel_exported`         | `kind: ReelExportKind`; `method: ReelExportMethod` | After a reel/image export is downloaded or shared in `src/components/recipe/reel-studio.tsx`.                    |

### Group collaboration and invite funnel

| Event                 | Properties                                                           | When it fires                                                                                                              |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `group_created`       | `groupId: string`; `sizeBucket: GroupSizeBucket`                     | After `createGroupAction` creates a group in `src/server/groups/actions.ts`; a new group uses size bucket `"1"`.           |
| `invite_sent`         | `groupId: string`; `role: InviteRole`; `sizeBucket: GroupSizeBucket` | When `addMemberAction` adds an existing user to a group in `src/server/groups/actions.ts`.                                 |
| `invite_accepted`     | `groupId: string`; `role: string`                                    | When a directly added member is activated, or when a new member accepts an invite link, in `src/server/groups/actions.ts`. |
| `invite_link_created` | `groupId: string`; `role: InviteRole`                                | When a manager creates a shareable invite link in `src/server/groups/actions.ts`.                                          |
| `invite_link_revoked` | `slug: string`                                                       | When a manager revokes a shareable invite link in `src/server/groups/actions.ts`.                                          |
| `member_role_changed` | `groupId: string`; `role: InviteRole`                                | After `updateMemberRoleAction` changes a member role in `src/server/groups/actions.ts`.                                    |
| `group_left`          | `groupId: string`                                                    | After `leaveGroupAction` removes the current user from a group in `src/server/groups/actions.ts`.                          |
| `group_deleted`       | `groupId: string`                                                    | After `deleteGroupAction` deletes a group in `src/server/groups/actions.ts`.                                               |

### Activation and onboarding

| Event                  | Properties              | When it fires                                                                                                                    |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `landing_viewed`       | `Record<string, never>` | Once when the marketing landing tracker mounts in `src/components/analytics/landing-viewed.tsx`.                                 |
| `signup_started`       | `Record<string, never>` | When Clerk sign-up CTAs are clicked in `src/components/auth/auth-controls.tsx` and `src/components/groups/join-group-panel.tsx`. |
| `signup_completed`     | `Record<string, never>` | When the app first inserts a new user row in `src/server/auth/index.ts`.                                                         |
| `first_recipe_created` | `recipeId: string`      | Once, when the author's recipe count first reaches one after create, in `src/server/recipes/actions.ts`.                         |
| `first_cook_started`   | `recipeId: string`      | On the user's first-ever Cook Mode start on that device in `src/components/cook/use-cook-session.ts`.                            |

### Waitlist

| Event             | Properties                                     | When it fires                                                                                                               |
| ----------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `waitlist_joined` | `source: WaitlistSource`; `duplicate: boolean` | After a successful waitlist submission in `src/components/marketing/waitlist-form.tsx`; the email is not an event property. |

### Weekly digest

| Event                   | Properties         | When it fires                                                             |
| ----------------------- | ------------------ | ------------------------------------------------------------------------- |
| `digest_opt_in_changed` | `optedIn: boolean` | After weekly digest preference changes in `src/server/digest/actions.ts`. |

### Experimentation

| Event                  | Properties                                                           | When it fires                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$feature_flag_called` | `$feature_flag: string`; `$feature_flag_response: string \| boolean` | When `useFeatureFlag()` resolves a key/value and records an exposure in `src/components/analytics/flags-provider.tsx`; deduped per key/value and consent-gated by `track()`.  |
| `experiment_exposed`   | `experiment: string`; `variant: string`                              | Taxonomy-defined for explicit experiment exposure events in `src/lib/analytics/events.ts`; current code search found `$feature_flag_called` as the active exposure mechanism. |

## Type aliases used by event properties

| Type               | Values                                           |
| ------------------ | ------------------------------------------------ |
| `RecipeVisibility` | `"private"`, `"group"`, `"unlisted"`, `"public"` |
| `RecipeSource`     | `"manual"`, `"import"`                           |
| `CookUnitSystem`   | `"original"`, `"us"`, `"metric"`, `"grams"`      |
| `ShareMethod`      | `"native"`, `"file"`, `"copy_link"`              |
| `ReelExportKind`   | `"image"`, `"video"`                             |
| `ReelExportMethod` | `"download"`, `"share"`                          |
| `InviteRole`       | `"admin"`, `"member"`, `"kid"`                   |
| `WaitlistSource`   | `"landing"`, `"hero"`, `"closing"`               |
| `GroupSizeBucket`  | `"1"`, `"2-5"`, `"6-10"`, `"11+"`                |

## Adding a new event

1. Add a new key to `EventProperties` in `src/lib/analytics/events.ts`.
2. Define the property shape with safe, low-cardinality values. Use
   `Record<string, never>` when the event has no properties.
3. Emit it with `track("event_name", { ... })` from browser code or
   `captureServer(distinctId, "event_name", { ... })` from server code.
4. Let TypeScript validate the event name and property shape. Runtime capture
   still passes through consent gating and `scrubProperties()`.
5. Update this reference and any related metric docs, especially
   `docs/analytics/activation.md` or `docs/analytics/retention.md` if the event
   changes those definitions.

_Related issue: #309._
