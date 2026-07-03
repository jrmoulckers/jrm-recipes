/**
 * Central brand + product configuration.
 *
 * Change the app's name/tagline in ONE place — it threads through metadata,
 * the PWA manifest, share cards, and the UI.
 */
export const brand = {
  name: "Heirloom",
  shortName: "Heirloom",
  tagline: "Family recipes, kept alive.",
  description:
    "Create, cook, and pass down the recipes your family loves — beautifully, together.",
  // Used for PWA theme color fallback + social cards. Real colors come from
  // the active theme tokens at runtime.
  themeColor: "#b45309",
  backgroundColor: "#fffaf3",
  locale: "en-US",
  // Social handles / links (fill in when they exist).
  links: {
    twitter: "",
    instagram: "",
    github: "https://github.com/jrmoulckers/jrm-recipes",
  },
} as const;

export type Brand = typeof brand;
