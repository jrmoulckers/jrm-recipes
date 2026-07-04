import { A11Y_COOKIE } from "~/config/a11y";

/**
 * Blocking inline script that applies saved accessibility preferences to
 * <html> BEFORE first paint — no flash of un-adjusted text size / contrast.
 * Mirrors ThemeScript. Runtime changes are handled by A11yProvider.
 */
export function A11yScript() {
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
    if (p.contrast === true) d.setAttribute("data-contrast", "high");
    if (p.motion === true) d.setAttribute("data-motion", "reduced");
    if (p.reading === true) d.setAttribute("data-reading", "readable");
  } catch (e) {}
})();
`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
