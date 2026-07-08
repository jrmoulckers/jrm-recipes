/**
 * One-tap "preset" filters for the recipes browse page (issue #378).
 *
 * A busy parent shouldn't have to set three separate controls to get a
 * weeknight-friendly view. Each preset is nothing more than a bundle of the
 * existing URL params (`maxTime`, `difficulty`, `sort`, `tag`) so results stay
 * shareable and SSR-friendly — there is deliberately no new filtering engine
 * here. This module is pure (no React / no `server-only`) so it can drive the
 * client chips and be unit-tested exhaustively.
 */

/** A single param a preset owns. `tag`/`cuisine` are treated as multi-value. */
export type PresetParam = { key: string; value: string };

export type RecipePreset = {
  id: string;
  label: string;
  /** Short helper text for tooltips / aria. */
  description: string;
  params: PresetParam[];
};

/** Params that can carry several values at once (repeated in the URL). */
export const MULTI_VALUE_PRESET_KEYS = new Set(["tag", "cuisine"]);

/**
 * The preset chips, in display order. `weeknight` is the headline: it composes
 * the three things a frazzled parent would otherwise set by hand.
 */
export const RECIPE_PRESETS: RecipePreset[] = [
  {
    id: "weeknight",
    label: "Weeknight",
    description: "Easy dinners in 30 minutes or less, quickest first.",
    params: [
      { key: "maxTime", value: "30" },
      { key: "difficulty", value: "easy" },
      { key: "sort", value: "quickest" },
    ],
  },
  {
    id: "quick-15",
    label: "≤15 min",
    description: "The fastest recipes you can make.",
    params: [
      { key: "maxTime", value: "15" },
      { key: "sort", value: "quickest" },
    ],
  },
  {
    id: "kid-friendly",
    label: "Kid-friendly",
    description: "Recipes tagged kid-friendly.",
    params: [{ key: "tag", value: "kid-friendly" }],
  },
];

/** True when every param the preset owns is present in the current URL. */
export function isPresetActive(
  current: URLSearchParams,
  preset: RecipePreset,
): boolean {
  return preset.params.every((param) =>
    MULTI_VALUE_PRESET_KEYS.has(param.key)
      ? current
          .getAll(param.key)
          .some((value) => value.toLowerCase() === param.value.toLowerCase())
      : current.get(param.key) === param.value,
  );
}

/**
 * Toggle a preset on/off against the current params, returning a fresh
 * `URLSearchParams`. When the preset is already fully active every param it
 * owns is cleared; otherwise each is applied (multi-value keys append the value
 * without disturbing the others already selected).
 */
export function togglePreset(
  current: URLSearchParams,
  preset: RecipePreset,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  const active = isPresetActive(current, preset);

  for (const param of preset.params) {
    if (MULTI_VALUE_PRESET_KEYS.has(param.key)) {
      const kept = next
        .getAll(param.key)
        .filter((value) => value.toLowerCase() !== param.value.toLowerCase());
      if (!active) kept.push(param.value);
      next.delete(param.key);
      for (const value of kept) next.append(param.key, value);
    } else if (active) {
      next.delete(param.key);
    } else {
      next.set(param.key, param.value);
    }
  }

  return next;
}
