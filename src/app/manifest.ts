import { type MetadataRoute } from "next";

import { brand } from "~/config/brand";

/**
 * PWA manifest, served at /manifest.webmanifest. Icons are generated into
 * /public/icons. Name/colors come from the single brand config.
 */
export default function manifest(): MetadataRoute.Manifest {
  // Reuse the app icon for shortcut glyphs; launchers scale it as needed.
  const shortcutIcons = [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  ];

  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
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
        name: "New recipe",
        short_name: "New recipe",
        description: "Start a new recipe or import one from a link.",
        url: "/recipes/new",
        icons: shortcutIcons,
      },
      {
        name: "Meal plan",
        short_name: "Plan",
        description: "Plan meals for the week ahead.",
        url: "/plan",
        icons: shortcutIcons,
      },
      {
        name: "Shopping list",
        short_name: "Shopping",
        description: "Review and check off your shopping list.",
        url: "/shopping",
        icons: shortcutIcons,
      },
    ],
    // Receive a link/text shared from another app and forward it into the
    // recipe importer. GET keeps it simple; the /import route does the routing.
    share_target: {
      action: "/import",
      method: "GET",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
  };
}
