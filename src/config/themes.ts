/**
 * Theme registry — the single source of truth for Heirloom's theming.
 *
 * There are two ORTHOGONAL axes:
 *   1. UI mode   (data-theme)  — the five visual "personalities"
 *   2. Color scheme (.dark)    — light / dark / system
 *
 * Every component styles itself using the semantic tokens defined in
 * `src/styles/themes.css`. Adding a new UI mode = one new block of tokens in
 * that file + one entry here. Nothing else in the app needs to change.
 */

export const UI_THEMES = [
  {
    id: "kitchen",
    label: "Kitchen",
    description: "Warm and cozy — creams, terracotta, and a little home-baked charm.",
    swatch: ["#b45309", "#7d8c5c", "#fff7ed"],
  },
  {
    id: "whimsy",
    label: "Whimsy",
    description: "Playful and colorful — bubbly shapes and joyful accents.",
    swatch: ["#a855f7", "#22d3ee", "#f472b6"],
  },
  {
    id: "professional",
    label: "Professional",
    description: "Clean and editorial — quiet, confident, magazine-grade.",
    swatch: ["#1f2d3d", "#c2410c", "#ffffff"],
  },
  {
    id: "kids",
    label: "Kids",
    description: "Big, bright, and friendly — easy taps and cheerful colors.",
    swatch: ["#2563eb", "#22c55e", "#f59e0b"],
  },
  {
    id: "barebones",
    label: "Simple",
    description: "Ultra-simple and high-contrast — just the essentials.",
    swatch: ["#1d4ed8", "#111111", "#ffffff"],
  },
] as const;

export type UITheme = (typeof UI_THEMES)[number]["id"];
export const UI_THEME_IDS = UI_THEMES.map((t) => t.id);
export const DEFAULT_UI_THEME: UITheme = "kitchen";

export const COLOR_SCHEMES = ["light", "dark", "system"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export const DEFAULT_COLOR_SCHEME: ColorScheme = "system";

/** Cookie names let the server render the correct theme with no flash. */
export const THEME_COOKIE = "heirloom-theme";
export const SCHEME_COOKIE = "heirloom-scheme";
/**
 * Remembers the UI mode that was active before Kids mode was switched on, so
 * turning Kids mode back off restores it instead of always dropping the family
 * into the default theme. Persisted alongside `heirloom-theme` so it survives a
 * reload; never stores `kids` itself.
 */
export const THEME_PREVIOUS_COOKIE = "heirloom-theme-prev";

export function isUITheme(value: unknown): value is UITheme {
  return typeof value === "string" && UI_THEME_IDS.includes(value as UITheme);
}

export function isColorScheme(value: unknown): value is ColorScheme {
  return (
    typeof value === "string" && COLOR_SCHEMES.includes(value as ColorScheme)
  );
}

/**
 * Behavioral flags a UI mode can carry beyond pure visuals. Kids/Simple modes
 * change UX (bigger targets, calmer motion, safer surfaces), not just colors.
 */
export const THEME_BEHAVIOR: Record<
  UITheme,
  { largeTargets: boolean; reduceMotion: boolean; simplifiedChrome: boolean; kidSafe: boolean }
> = {
  kitchen: { largeTargets: false, reduceMotion: false, simplifiedChrome: false, kidSafe: false },
  whimsy: { largeTargets: false, reduceMotion: false, simplifiedChrome: false, kidSafe: false },
  professional: { largeTargets: false, reduceMotion: false, simplifiedChrome: false, kidSafe: false },
  kids: { largeTargets: true, reduceMotion: false, simplifiedChrome: true, kidSafe: true },
  barebones: { largeTargets: true, reduceMotion: true, simplifiedChrome: true, kidSafe: false },
};
