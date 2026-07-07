"use client";

import * as React from "react";

import {
  type ColorScheme,
  type UITheme,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_UI_THEME,
  SCHEME_COOKIE,
  THEME_COOKIE,
  THEME_PREVIOUS_COOKIE,
  THEME_BEHAVIOR,
  isColorScheme,
  isUITheme,
} from "~/config/themes";

type ThemeContextValue = {
  /** The active UI mode (kitchen / whimsy / professional / kids / barebones). */
  theme: UITheme;
  /** The user's chosen scheme preference (may be "system"). */
  scheme: ColorScheme;
  /** The concrete scheme after resolving "system". */
  resolvedScheme: "light" | "dark";
  behavior: (typeof THEME_BEHAVIOR)[UITheme];
  setTheme: (theme: UITheme) => void;
  /**
   * Toggle Kids mode. Enabling it remembers the current UI mode; disabling it
   * restores that remembered mode (or the default when there isn't one).
   */
  setKidsMode: (on: boolean) => void;
  setScheme: (scheme: ColorScheme) => void;
  toggleScheme: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${ONE_YEAR};samesite=lax`;
  } catch {
    /* storage may be unavailable (private mode) — theme still applies live */
  }
}

/** Read a persisted value, preferring localStorage and falling back to cookie. */
function readPersisted(name: string): string | null {
  try {
    const stored = localStorage.getItem(name);
    if (stored) return stored;
  } catch {
    /* ignore — fall through to cookie */
  }
  try {
    const prefix = `${name}=`;
    for (const part of document.cookie.split("; ")) {
      if (part.startsWith(prefix)) {
        return decodeURIComponent(part.slice(prefix.length));
      }
    }
  } catch {
    /* storage may be unavailable */
  }
  return null;
}

function clearPersisted(name: string) {
  try {
    localStorage.removeItem(name);
    document.cookie = `${name}=;path=/;max-age=0;samesite=lax`;
  } catch {
    /* storage may be unavailable */
  }
}

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ThemeProvider({
  children,
  initialTheme,
  initialScheme,
}: {
  children: React.ReactNode;
  initialTheme?: UITheme;
  initialScheme?: ColorScheme;
}) {
  const [theme, setThemeState] = React.useState<UITheme>(
    initialTheme && isUITheme(initialTheme) ? initialTheme : DEFAULT_UI_THEME,
  );
  const [scheme, setSchemeState] = React.useState<ColorScheme>(
    initialScheme && isColorScheme(initialScheme)
      ? initialScheme
      : DEFAULT_COLOR_SCHEME,
  );
  const [resolvedScheme, setResolvedScheme] = React.useState<"light" | "dark">(
    "light",
  );

  // Apply UI mode to <html>.
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Apply + track color scheme, reacting to system changes when in "system".
  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = scheme === "dark" || (scheme === "system" && mql.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      setResolvedScheme(dark ? "dark" : "light");
    };
    apply();
    if (scheme === "system") {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
  }, [scheme]);

  const setTheme = React.useCallback((next: UITheme) => {
    setThemeState(next);
    persist(THEME_COOKIE, next);
  }, []);

  const setKidsMode = React.useCallback(
    (on: boolean) => {
      if (on) {
        // Remember the mode we're leaving so we can come back to it later.
        // Never record "kids" itself (e.g. Kids mode was already active).
        if (theme !== "kids") persist(THEME_PREVIOUS_COOKIE, theme);
        setTheme("kids");
        return;
      }
      // Restore the remembered mode. Fall back to the default when there isn't
      // a valid one — e.g. Kids was picked straight from the mode picker.
      const remembered = readPersisted(THEME_PREVIOUS_COOKIE);
      const restored =
        isUITheme(remembered) && remembered !== "kids"
          ? remembered
          : DEFAULT_UI_THEME;
      clearPersisted(THEME_PREVIOUS_COOKIE);
      setTheme(restored);
    },
    [theme, setTheme],
  );

  const setScheme = React.useCallback((next: ColorScheme) => {
    setSchemeState(next);
    persist(SCHEME_COOKIE, next);
  }, []);

  const toggleScheme = React.useCallback(() => {
    setScheme(resolvedScheme === "dark" ? "light" : "dark");
  }, [resolvedScheme, setScheme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      scheme,
      resolvedScheme,
      behavior: THEME_BEHAVIOR[theme],
      setTheme,
      setKidsMode,
      setScheme,
      toggleScheme,
    }),
    [theme, scheme, resolvedScheme, setTheme, setKidsMode, setScheme, toggleScheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

export { systemPrefersDark };
