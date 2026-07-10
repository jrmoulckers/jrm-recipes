import {
  DEFAULT_COLOR_SCHEME,
  DEFAULT_UI_THEME,
  SCHEME_COOKIE,
  THEME_COOKIE,
} from "~/config/themes";

/**
 * Blocking inline script that applies the saved (or system) theme to <html>
 * BEFORE first paint, eliminating any flash of the wrong theme. Kept tiny and
 * dependency-free on purpose. Runtime changes are handled by ThemeProvider.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const script = `
(function () {
  try {
    var d = document.documentElement;
    function cookie(name) {
      var m = document.cookie.match('(^|;)\\\\s*' + name + '\\\\s*=\\\\s*([^;]+)');
      return m ? decodeURIComponent(m.pop()) : null;
    }
    var themes = ["kitchen","whimsy","professional","kids","barebones"];
    var theme = cookie(${JSON.stringify(THEME_COOKIE)}) || localStorage.getItem(${JSON.stringify(THEME_COOKIE)});
    if (themes.indexOf(theme) === -1) theme = ${JSON.stringify(DEFAULT_UI_THEME)};
    d.setAttribute("data-theme", theme);

    var scheme = cookie(${JSON.stringify(SCHEME_COOKIE)}) || localStorage.getItem(${JSON.stringify(SCHEME_COOKIE)}) || ${JSON.stringify(DEFAULT_COLOR_SCHEME)};
    var isDark = scheme === "dark" || (scheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    d.classList.toggle("dark", isDark);
    d.style.colorScheme = isDark ? "dark" : "light";
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
