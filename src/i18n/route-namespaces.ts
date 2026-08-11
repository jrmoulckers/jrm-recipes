/**
 * GENERATED FILE — do not edit by hand.
 *
 * Run `pnpm i18n:route-scope` to regenerate; `pnpm i18n:route-scope --check`
 * (part of `pnpm copy:check`) fails CI when it drifts from the source tree.
 *
 * Which message namespaces each route's **client** components can reach, so the
 * route-scoped `NextIntlClientProvider` can hand the client that subset instead
 * of the whole ~130 kB catalog (#674). The provider receives `messages` as a
 * prop, so whatever it is given is serialized into the RSC flight payload.
 *
 * Derived by static analysis of the client import graph
 * (`scripts/lib/i18n-route-scope.mjs`), which over-approximates on purpose: an
 * extra namespace only costs bytes, a missing one is a visible
 * `MISSING_MESSAGE` in the UI.
 */

/**
 * Namespaces rendered *above* every route-scoped provider — the root layout and
 * the group layouts (site header, bottom nav, error and offline UI). These
 * layouts are preserved across client-side navigation, so this set ships once
 * per document and must be a superset of what the persistent shell uses.
 */
export const SHELL_NAMESPACES: readonly string[] = [
  'accessibilityMenu',
  'auth',
  'common',
  'cook',
  'errors',
  'footer',
  'localeSwitcher',
  'nav',
  'notifications',
  'privacy',
  'profile',
  'pwa',
  'search',
  'theme',
];

/**
 * Extra namespaces per route, on top of {@link SHELL_NAMESPACES}. Patterns use
 * `:` for a dynamic segment; route groups are erased because they do not appear
 * in the URL.
 */
export const ROUTE_NAMESPACES: Readonly<Record<string, readonly string[]>> = {
  '/': ['classificationNames', 'collections', 'groups', 'marketing', 'onboarding', 'recipe'],
  '/~offline': [],
  '/collections': ['classificationNames', 'collections', 'recipe'],
  '/collections/:': ['classificationNames', 'collections', 'imageUpload', 'mediaPicker', 'recipe'],
  '/collections/:/print': [],
  '/cooks/:': ['classificationNames', 'collections', 'follows', 'recipe'],
  '/cooks/:/followers': ['follows'],
  '/cooks/:/following': ['follows'],
  '/design': [],
  '/discover': ['classificationNames', 'collections', 'recipe'],
  '/embed/recipes/:': [],
  '/groups': ['groups'],
  '/groups/:': ['groups'],
  '/groups/:/moderation': ['groups'],
  '/groups/:/settings': ['groups', 'imageUpload', 'mediaPicker'],
  '/join/:': ['groups'],
  '/journal': ['cookLog'],
  '/notifications': ['recipeCreators'],
  '/plan': ['planner', 'shopping'],
  '/plan/print': ['print'],
  '/pricing': [],
  '/profile': ['imageUpload', 'mediaPicker'],
  '/r/:': [
    'characterCounter',
    'classificationNames',
    'collections',
    'cookLog',
    'engagement',
    'imageUpload',
    'ingredientSubstitutions',
    'ingredientsPanel',
    'mediaPicker',
    'moderation',
    'nutritionPanel',
    'recipe',
    'recipeCreators',
    'recipeDetail',
    'saveToCollection',
    'share',
    'shopping',
    'versionCompare',
  ],
  '/recipes': [
    'classificationNames',
    'collections',
    'imageUpload',
    'mediaPicker',
    'onboarding',
    'recipe',
    'recipeDetail',
    'recipeSearch',
  ],
  '/recipes/:': [],
  '/recipes/:/:': [
    'characterCounter',
    'classificationNames',
    'collections',
    'cookLog',
    'engagement',
    'imageUpload',
    'ingredientSubstitutions',
    'ingredientsPanel',
    'mediaPicker',
    'moderation',
    'nutritionPanel',
    'recipe',
    'recipeCreators',
    'recipeDetail',
    'saveToCollection',
    'share',
    'shopping',
    'versionCompare',
  ],
  '/recipes/:/:/cook': [
    'engagement',
    'ingredientSubstitutions',
    'ingredientsDrawer',
    'ingredientsPanel',
    'nutritionPanel',
  ],
  '/recipes/:/:/edit': [
    'billing',
    'classificationNames',
    'imageUpload',
    'mediaPicker',
    'recipe',
    'recipeDetail',
    'recipeEditor',
    'recipePreview',
  ],
  '/recipes/:/:/keepsake': ['keepsake'],
  '/recipes/:/:/print': ['print'],
  '/recipes/cook-with': ['classificationNames', 'collections', 'recipe'],
  '/recipes/new': [
    'billing',
    'classificationNames',
    'imageUpload',
    'mediaPicker',
    'recipe',
    'recipeDetail',
    'recipeEditor',
    'recipePreview',
  ],
  '/recipes/tags': [],
  '/redeem': ['billing'],
  '/settings/billing': ['billing'],
  '/settings/blocked': ['settings'],
  '/settings/data': ['settings'],
  '/settings/dietary': ['dietary'],
  '/settings/following': ['settings'],
  '/settings/notifications': ['settings'],
  '/settings/photos': ['settings'],
  '/settings/units': ['settings'],
  '/shopping': ['shopping'],
};
