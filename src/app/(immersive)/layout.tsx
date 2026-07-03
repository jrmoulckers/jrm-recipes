import * as React from "react";

/**
 * Immersive layout — full-bleed surfaces that intentionally drop the site
 * chrome (header/footer/nav) so cooking and printing feel focused. Inherits the
 * root layout's theming, fonts and providers.
 */
export default function ImmersiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
