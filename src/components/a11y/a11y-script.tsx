import { A11Y_COOKIE } from "~/config/a11y";

/**
 * Blocking inline script that applies saved accessibility preferences to
 * <html> BEFORE first paint — no flash of un-adjusted text size / contrast.
 * Mirrors ThemeScript. Runtime changes are handled by A11yProvider.
 *
 * contrast/motion are tri-state: "on" paints the enhancement, "off" writes an
 * explicit data-*="off" that gates the OS media queries (so an explicit opt-out
 * wins), and an absent/legacy value writes nothing so `prefers-contrast` /
 * `prefers-reduced-motion` govern automatically — no flash, no matchMedia needed.
 */
export function A11yScript({ nonce }: { nonce?: string }) {
  const script = `
(function () {
  try {
    var d = document.documentElement;
    function cookie(name) {
      var m = document.cookie.match('(^|;)\\\\s*' + name + '\\\\s*=\\\\s*([^;]+)');
      return m ? decodeURIComponent(m.pop()) : null;
    }
    var raw = cookie(${JSON.stringify(A11Y_COOKIE)}) || localStorage.getItem(${JSON.stringify(A11Y_COOKIE)});
    if (!raw) return;
    var p = JSON.parse(raw);
    if (p.textSize === "large" || p.textSize === "xl") d.setAttribute("data-text", p.textSize);
    if (p.contrast === "on" || p.contrast === true) d.setAttribute("data-contrast", "high");
    else if (p.contrast === "off") d.setAttribute("data-contrast", "off");
    if (p.motion === "on" || p.motion === true) d.setAttribute("data-motion", "reduced");
    else if (p.motion === "off") d.setAttribute("data-motion", "off");
    if (p.reading === true) d.setAttribute("data-reading", "readable");
  } catch (e) {}
})();
`;
  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
