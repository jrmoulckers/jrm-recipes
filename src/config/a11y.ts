/**
 * Accessibility preferences — a THIRD axis, orthogonal to UI mode + color
 * scheme. These are per-user comfort/safety settings ("accessibility modes and
 * features for all") that any of the five themes inherit:
 *
 *   • textSize  -> [data-text="large|xl"]     bigger base font
 *   • contrast  -> [data-contrast="high"]     maximum ink/border contrast
 *   • motion    -> [data-motion="reduced"]    stop animation/transition
 *   • reading   -> [data-reading="readable"]  dyslexia-friendly spacing/type
 *
 * Applied as data-attributes on <html>; the CSS in src/styles/a11y.css reacts.
 * Persisted in one cookie so the server can render them with no flash.
 */

export const TEXT_SIZES = ["default", "large", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export type A11yPrefs = {
  /** Base font scale, on top of each theme's own --text-scale. */
  textSize: TextSize;
  /** Maximize foreground/border contrast, keep brand hues. */
  contrast: boolean;
  /** Force-stop motion regardless of OS setting. */
  motion: boolean;
  /** Roomier spacing + highly legible type for easier reading. */
  reading: boolean;
};

export const DEFAULT_A11Y: A11yPrefs = {
  textSize: "default",
  contrast: false,
  motion: false,
  reading: false,
};

/** One cookie holds the whole (small) object, URL-encoded JSON. */
export const A11Y_COOKIE = "heirloom-a11y";

/** Every <html> attribute this system controls (used to clear before applying). */
export const A11Y_MANAGED_ATTRS = [
  "data-text",
  "data-contrast",
  "data-motion",
  "data-reading",
] as const;

export function isTextSize(value: unknown): value is TextSize {
  return typeof value === "string" && (TEXT_SIZES as readonly string[]).includes(value);
}

/** Parse a (decoded) cookie/localStorage value into a safe, complete prefs object. */
export function parseA11y(raw: string | null | undefined): A11yPrefs {
  if (!raw) return { ...DEFAULT_A11Y };
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof A11yPrefs, unknown>>;
    return {
      textSize: isTextSize(data.textSize) ? data.textSize : DEFAULT_A11Y.textSize,
      contrast: data.contrast === true,
      motion: data.motion === true,
      reading: data.reading === true,
    };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

export function serializeA11y(prefs: A11yPrefs): string {
  return JSON.stringify(prefs);
}

/** Map prefs to the <html> data-attributes to set (defaults are omitted). */
export function a11yAttributes(prefs: A11yPrefs): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (prefs.textSize !== "default") attrs["data-text"] = prefs.textSize;
  if (prefs.contrast) attrs["data-contrast"] = "high";
  if (prefs.motion) attrs["data-motion"] = "reduced";
  if (prefs.reading) attrs["data-reading"] = "readable";
  return attrs;
}

/** True when any preference is non-default (drives the "active" badge in UI). */
export function isA11yActive(prefs: A11yPrefs): boolean {
  return (
    prefs.textSize !== "default" ||
    prefs.contrast ||
    prefs.motion ||
    prefs.reading
  );
}
