/**
 * Accessibility preferences — a THIRD axis, orthogonal to UI mode + color
 * scheme. These are per-user comfort/safety settings ("accessibility modes and
 * features for all") that any of the five themes inherit:
 *
 *   • textSize  -> [data-text="large|xl"]     bigger base font
 *   • contrast  -> [data-contrast="high|off"] maximum ink/border contrast
 *   • motion    -> [data-motion="reduced|off"] stop animation/transition
 *   • reading   -> [data-reading="readable"]  dyslexia-friendly spacing/type
 *
 * `contrast` and `motion` are TRI-STATE. Unlike a plain on/off, a value can be:
 *   • "on"      — user explicitly enabled it (wins over the OS)
 *   • "off"     — user explicitly disabled it (wins over the OS)
 *   • undefined — unset: FOLLOW the OS (`prefers-contrast`/`prefers-reduced-motion`)
 * Unset is the default, so a fresh visitor inherits their system settings; the
 * CSS media queries in a11y.css/globals.css apply automatically, and an explicit
 * "off" gates those media queries via the `[data-*="off"]` attribute.
 *
 * Applied as data-attributes on <html>; the CSS in src/styles/a11y.css reacts.
 * Persisted in one cookie so the server can render them with no flash.
 */

export const TEXT_SIZES = ["default", "large", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Explicit user choice for an OS-backed preference; undefined = follow the OS. */
export type A11yTriState = "on" | "off";

export type A11yPrefs = {
  /** Base font scale, on top of each theme's own --text-scale. */
  textSize: TextSize;
  /** Maximize foreground/border contrast. Undefined follows `prefers-contrast`. */
  contrast?: A11yTriState;
  /** Force-stop / force-allow motion. Undefined follows `prefers-reduced-motion`. */
  motion?: A11yTriState;
  /** Roomier spacing + highly legible type for easier reading. */
  reading: boolean;
};

export const DEFAULT_A11Y: A11yPrefs = {
  textSize: "default",
  // contrast + motion intentionally omitted: unset => follow the OS.
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

/**
 * Normalize a stored contrast/motion value into the tri-state.
 *   • "on" / legacy `true`  -> "on"  (explicit enable)
 *   • "off"                 -> "off" (explicit disable)
 *   • missing / legacy `false` / anything else -> undefined (follow the OS)
 * Legacy booleans are coerced so old cookies keep working: a legacy `false`
 * (the previous default that always got persisted) becomes "unset" rather than
 * a hard "off", preserving OS-follow behavior for existing visitors.
 */
export function parseTriState(value: unknown): A11yTriState | undefined {
  if (value === "on" || value === true) return "on";
  if (value === "off") return "off";
  return undefined;
}

/** Resolve a tri-state against the live OS signal: an explicit choice wins. */
export function resolveTriState(
  value: A11yTriState | undefined,
  systemOn: boolean,
): boolean {
  if (value === "on") return true;
  if (value === "off") return false;
  return systemOn;
}

/** Parse a (decoded) cookie/localStorage value into a safe, complete prefs object. */
export function parseA11y(raw: string | null | undefined): A11yPrefs {
  if (!raw) return { ...DEFAULT_A11Y };
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof A11yPrefs, unknown>>;
    return {
      textSize: isTextSize(data.textSize) ? data.textSize : DEFAULT_A11Y.textSize,
      contrast: parseTriState(data.contrast),
      motion: parseTriState(data.motion),
      reading: data.reading === true,
    };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

export function serializeA11y(prefs: A11yPrefs): string {
  return JSON.stringify(prefs);
}

/** Map prefs to the <html> data-attributes to set (defaults/unset are omitted). */
export function a11yAttributes(prefs: A11yPrefs): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (prefs.textSize !== "default") attrs["data-text"] = prefs.textSize;
  // "on"/"off" are explicit; undefined omits the attr so the OS media query wins.
  if (prefs.contrast === "on") attrs["data-contrast"] = "high";
  else if (prefs.contrast === "off") attrs["data-contrast"] = "off";
  if (prefs.motion === "on") attrs["data-motion"] = "reduced";
  else if (prefs.motion === "off") attrs["data-motion"] = "off";
  if (prefs.reading) attrs["data-reading"] = "readable";
  return attrs;
}

/** True when any preference is explicitly set (drives the "active" badge in UI). */
export function isA11yActive(prefs: A11yPrefs): boolean {
  return (
    prefs.textSize !== "default" ||
    prefs.contrast !== undefined ||
    prefs.motion !== undefined ||
    prefs.reading
  );
}
