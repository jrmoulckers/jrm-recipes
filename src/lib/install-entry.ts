/**
 * Pure decision logic for the manual "Install app" entry point (#188). Kept
 * DOM-free so it's unit-testable; the component in
 * `src/components/pwa/install-app-button.tsx` feeds it live browser state.
 */

export type InstallEntryMode = "native" | "ios" | "hidden";

/**
 * How (or whether) to surface the manual install control:
 * - `hidden` when already installed / running standalone, or when there's no
 *   way to install (no captured `beforeinstallprompt` and not iOS Safari);
 * - `native` when a deferred `beforeinstallprompt` is available to replay;
 * - `ios` when running iOS Safari, which has no programmatic prompt and instead
 *   needs the "Add to Home Screen" tip.
 *
 * A captured native prompt wins over the iOS tip so we always prefer the
 * one-tap OS flow when the platform offers it.
 */
export function installEntryMode(opts: {
  standalone: boolean;
  installed: boolean;
  hasDeferredPrompt: boolean;
  iosEligible: boolean;
}): InstallEntryMode {
  if (opts.standalone || opts.installed) return "hidden";
  if (opts.hasDeferredPrompt) return "native";
  if (opts.iosEligible) return "ios";
  return "hidden";
}
