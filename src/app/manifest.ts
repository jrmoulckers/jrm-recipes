import { type MetadataRoute } from "next";

import { brand } from "~/config/brand";
import { DEFAULT_LOCALE, localeDirection } from "~/config/i18n";
import en from "~/messages/en.json";

/**
 * PWA manifest, served at /manifest.webmanifest. Manifest routes are statically
 * generated and can't read the locale cookie, so the installed app's strings use
 * the default-locale catalog ({@link DEFAULT_LOCALE}); the brand wordmark and
 * colors still come from the single brand config. The active-locale experience
 * is localized at runtime via `generateMetadata` in the root layout.
 */
export default function manifest(): MetadataRoute.Manifest {
  // Reuse the app icon for shortcut glyphs; launchers scale it as needed.
  const shortcutIcons = [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  ];

  const { description, shortcuts } = en.metadata;

  return {
    name: brand.name,
    short_name: brand.shortName,
    description,
    lang: DEFAULT_LOCALE,
    dir: localeDirection(DEFAULT_LOCALE),
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Ordered fallback if a target can't honor "standalone": drop to the
    // slimmer "minimal-ui" chrome rather than a full browser tab. (No
    // "window-controls-overlay" — the desktop chrome isn't designed to draw
    // into the titlebar, so requesting it would just leave an empty drag strip.)
    display_override: ["standalone", "minimal-ui"],
    // Re-launching the app or opening a shared link focuses/navigates the
    // existing installed window instead of spawning a duplicate one.
    launch_handler: {
      client_mode: "navigate-existing",
    },
    // "any" (not "portrait") so installed tablets/phones can rotate into
    // landscape cook mode instead of being locked upright.
    orientation: "any",
    background_color: brand.backgroundColor,
    // Neutral surface color (matches the background) rather than one theme's
    // accent, so the installed chrome reads cleanly across all five UI themes.
    theme_color: brand.backgroundColor,
    categories: ["food", "lifestyle", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // High-intent jump points for a long-press / right-click on the installed
    // icon. Static routes only.
    shortcuts: [
      {
        name: shortcuts.newRecipe.name,
        short_name: shortcuts.newRecipe.short_name,
        description: shortcuts.newRecipe.description,
        url: "/recipes/new",
        icons: shortcutIcons,
      },
      {
        name: shortcuts.plan.name,
        short_name: shortcuts.plan.short_name,
        description: shortcuts.plan.description,
        url: "/plan",
        icons: shortcutIcons,
      },
      {
        name: shortcuts.shopping.name,
        short_name: shortcuts.shopping.short_name,
        description: shortcuts.shopping.description,
        url: "/shopping",
        icons: shortcutIcons,
      },
    ],
    // Unlocks Chromium's richer, taller install dialog. One wide (desktop) and
    // one narrow (mobile) shot, generated on-brand by scripts/generate-screenshots.mjs.
    screenshots: [
      {
        src: "/screenshots/cookbook-wide.png",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "Browse your family cookbook",
      },
      {
        src: "/screenshots/cook-mode-narrow.png",
        sizes: "800x1280",
        type: "image/png",
        form_factor: "narrow",
        label: "Hands-free Cook Mode with step timers",
      },
    ],
    // Receive a link/text OR a shared photo from another app and forward it
    // into the recipe importer. POST + multipart is required to accept files;
    // the /import route uploads a shared image and routes text/url shares.
    share_target: {
      action: "/import",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "photo",
            accept: [
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/heic",
              "image/heif",
              "image/gif",
            ],
          },
        ],
      },
    },
  };
}
