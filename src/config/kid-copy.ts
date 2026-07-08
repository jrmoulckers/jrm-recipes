/**
 * Kids-mode microcopy (#140).
 *
 * Kids mode is a first-class experience (`THEME_BEHAVIOR.kids.kidSafe`), but the
 * words stay adult unless a surface opts in. This tiny map holds kid-friendly
 * variants for a handful of high-traffic strings, kept short and concrete
 * (aim ~grade-2 reading level). Non-Kids modes never see these — the pickers
 * return the caller's original copy untouched.
 *
 * Add a key here, then read it at the surface with {@link pickKidCopy} (paired
 * with `useThemeBehavior().kidSafe`) or {@link pickCopy} (when you only have the
 * theme id). This is intentionally NOT a full i18n layer — just the core flows.
 */

import { THEME_BEHAVIOR, type UITheme } from "~/config/themes";

export const KID_COPY = {
  /** Primary create call-to-action (library empty state). */
  "cta.create": "Add a recipe!",
  /** Empty recipe library headline. */
  "empty.recipes.title": "No recipes yet!",
  /** Empty recipe library body. */
  "empty.recipes.body": "Let's add your favorite food.",
  /** Cook-mode completion headline (mirrors cook-completion's celebratory copy). */
  "cook.complete": "You did it! 🎉",
  /** Missing-title validation when saving a recipe. */
  "validation.title": "Give your recipe a name!",
} as const satisfies Record<string, string>;

export type KidCopyKey = keyof typeof KID_COPY;

/**
 * Return the kid-friendly variant when `kidSafe` is on, else the caller's
 * original copy. Pair with `useThemeBehavior().kidSafe` in client components.
 */
export function pickKidCopy(
  kidSafe: boolean,
  key: KidCopyKey,
  fallback: string,
): string {
  return kidSafe ? KID_COPY[key] : fallback;
}

/**
 * Theme-id variant of {@link pickKidCopy} for callers that only have the active
 * UI mode (e.g. server-resolved theme) rather than the behavior flags.
 */
export function pickCopy(
  theme: UITheme,
  key: KidCopyKey,
  fallback: string,
): string {
  return pickKidCopy(THEME_BEHAVIOR[theme]?.kidSafe ?? false, key, fallback);
}
