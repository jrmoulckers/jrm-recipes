import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type Appearance = NonNullable<
  ComponentProps<typeof ClerkProvider>["appearance"]
>;

/**
 * Clerk appearance, mapped onto Heirloom's semantic design tokens.
 *
 * Clerk's built-in UI (the sign-in / sign-up modals and the `<UserButton>`
 * dropdown) renders in a portal and otherwise ships with Clerk's own default
 * palette, radius, and typography — which look nothing like the rest of the
 * app. Rather than hard-code colors here, every value points at the same CSS
 * variables the whole design system already uses (see `styles/themes.css`).
 *
 * Because those tokens live on the root element and flip per UI mode
 * (`data-theme`) and color scheme (`.dark`), Clerk's portaled UI inherits them
 * too — so it automatically tracks all five modes (Kitchen / Whimsy /
 * Professional / Kids / Barebones) and light/dark with zero extra wiring, just
 * like a native `~/components/ui` primitive.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "hsl(var(--primary))",
    colorPrimaryForeground: "hsl(var(--primary-foreground))",
    colorForeground: "hsl(var(--foreground))",
    colorMutedForeground: "hsl(var(--muted-foreground))",
    colorMuted: "hsl(var(--muted))",
    colorBackground: "hsl(var(--card))",
    colorInput: "hsl(var(--background))",
    colorInputForeground: "hsl(var(--foreground))",
    colorNeutral: "hsl(var(--foreground))",
    colorBorder: "hsl(var(--border))",
    colorRing: "hsl(var(--ring))",
    colorShadow: "hsl(var(--foreground))",
    colorDanger: "hsl(var(--destructive))",
    colorSuccess: "hsl(var(--success))",
    colorWarning: "hsl(var(--warning))",
    colorShimmer: "hsl(var(--muted))",
    colorModalBackdrop: "hsl(var(--foreground) / 0.45)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-body)",
    fontFamilyButtons: "var(--font-body)",
  },
  elements: {
    // Match the site's primary Button: token shadow + no forced uppercasing.
    formButtonPrimary: "shadow-token normal-case tracking-normal",
    // Give the card the app's large elevation used by dialogs/popovers.
    card: "shadow-token-lg",
    modalContent: "shadow-token-lg",
    // Sign-in/up links should read like the app's link buttons.
    footerActionLink: "text-primary hover:text-primary/90",
  },
};
