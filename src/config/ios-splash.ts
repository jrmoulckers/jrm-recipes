/**
 * iOS launch-splash wiring (#187). iOS Safari ignores the web manifest for the
 * install glyph and launch screen, so we emit `apple-touch-startup-image` links
 * (one per device × orientation) from the root metadata. The device table lives
 * in `ios-splash-devices.json` so this module and `scripts/generate-icons.mjs`
 * share a single source of truth: the script rasterizes an image per entry with
 * the exact filename this module references.
 *
 * NOTE: the filename + media-query formulas below are mirrored in
 * `scripts/generate-icons.mjs` (Node can't import this TS module). Keep them in
 * sync — a change here must be reflected there or the links will 404.
 */
import devices from "./ios-splash-devices.json";

export type IosSplashDevice = {
  /** CSS width in points (portrait). */
  w: number;
  /** CSS height in points (portrait). */
  h: number;
  /** Device pixel ratio. */
  dpr: number;
  label: string;
};

export type SplashOrientation = "portrait" | "landscape";

export const IOS_SPLASH_DEVICES: readonly IosSplashDevice[] = devices;

/** Deterministic asset filename for a device + orientation. */
export function iosSplashFileName(
  device: IosSplashDevice,
  orientation: SplashOrientation,
): string {
  return `apple-splash-${device.w}-${device.h}-${device.dpr}x-${orientation}.png`;
}

/** Rasterized pixel dimensions for a device + orientation. */
export function iosSplashPixels(
  device: IosSplashDevice,
  orientation: SplashOrientation,
): { width: number; height: number } {
  const long = device.h * device.dpr;
  const short = device.w * device.dpr;
  return orientation === "portrait"
    ? { width: short, height: long }
    : { width: long, height: short };
}

/** The `media` attribute iOS matches a startup image against. */
export function iosSplashMedia(
  device: IosSplashDevice,
  orientation: SplashOrientation,
): string {
  return (
    `screen and (device-width: ${device.w}px) and (device-height: ${device.h}px) ` +
    `and (-webkit-device-pixel-ratio: ${device.dpr}) and (orientation: ${orientation})`
  );
}

/**
 * The full set of `{ url, media }` startup-image descriptors for Next's
 * `metadata.appleWebApp.startupImage`, covering every device in both
 * orientations so an installed app never shows a blank launch.
 */
export function iosStartupImages(): { url: string; media: string }[] {
  const orientations: SplashOrientation[] = ["portrait", "landscape"];
  return IOS_SPLASH_DEVICES.flatMap((device) =>
    orientations.map((orientation) => ({
      url: `/icons/${iosSplashFileName(device, orientation)}`,
      media: iosSplashMedia(device, orientation),
    })),
  );
}
