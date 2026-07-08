import { type Config } from "tailwindcss";

/**
 * Every color is driven by a CSS variable (see src/styles/themes.css) so the
 * five UI modes (Kitchen / Whimsy / Professional / Kids / Barebones) and
 * light/dark can be swapped purely by re-defining tokens — no per-component
 * theming. Components must only ever reference these semantic names.
 */
const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--surface-foreground) / <alpha-value>)",
          muted: "hsl(var(--surface-muted) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          foreground: "hsl(var(--info-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      /**
       * Tokenized type scale (issue #98). Sizes are in `rem` so they inherit the
       * root `font-size: calc(100% * --text-scale * --a11y-text-mult)` — i.e. the
       * per-mode `--text-scale` and the a11y text-size axis both scale every step
       * automatically. Each step ships a paired line-height (and tracking on the
       * larger display steps) so hierarchy stays coherent across all five modes'
       * display fonts. Consume via the `Heading` / `Text` primitives.
       */
      fontSize: {
        display: ["3rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        h1: ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        h2: ["1.75rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        h3: ["1.375rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        h4: ["1.125rem", { lineHeight: "1.4", letterSpacing: "-0.005em" }],
        "body-lg": ["1.125rem", { lineHeight: "1.7" }],
        body: ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.55" }],
      },
      boxShadow: {
        "token-sm": "var(--shadow-sm)",
        token: "var(--shadow)",
        "token-lg": "var(--shadow-lg)",
      },
      /**
       * Focus rings are token-driven: `ring-2` resolves to `--ring-width`
       * (2px by default, 3px in Kids / Simple / high-contrast) so every
       * `focus-visible:ring-2` scales with the mode instead of being pinned to
       * a literal 2px. This is the single canonical focus width (issue #85).
       */
      ringWidth: {
        2: "var(--ring-width)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pop-out": {
          "0%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.96)" },
        },
        "slide-in-from-right": {
          "0%": { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-out-to-right": {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(100%)" },
        },
        "heart-pop": {
          "0%": { transform: "scale(1)" },
          "25%": { transform: "scale(0.8)" },
          "55%": { transform: "scale(1.2)" },
          "100%": { transform: "scale(1)" },
        },
        "heart-burst": {
          "0%": { transform: "scale(0.5)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        "star-pop": {
          "0%": { transform: "scale(0.6)", opacity: "0.4" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "check-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.2)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "check-box-pop": {
          "0%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)" },
        },
        "strike-in": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "number-roll": {
          "0%": { transform: "translateY(70%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "amount-flash": {
          "0%": { backgroundColor: "hsl(var(--primary) / 0.25)" },
          "100%": { backgroundColor: "hsl(var(--primary) / 0)" },
        },
        "timer-done-pulse": {
          "0%, 100%": { opacity: "0", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.02)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
      },
      animation: {
        "accordion-down": "accordion-down 0.2s var(--ease-standard)",
        "accordion-up": "accordion-up 0.2s var(--ease-standard)",
        "fade-in": "fade-in 0.2s var(--ease-standard)",
        "fade-out": "fade-out 0.15s var(--ease-standard)",
        "pop-in": "pop-in 0.18s var(--ease-standard)",
        "pop-out": "pop-out 0.15s var(--ease-standard)",
        "slide-in-from-right": "slide-in-from-right 0.24s var(--ease-standard)",
        "slide-out-to-right": "slide-out-to-right 0.2s var(--ease-standard)",
        "heart-pop": "heart-pop 0.4s var(--ease-emphasized)",
        "heart-burst": "heart-burst 0.45s var(--ease-standard)",
        "star-pop": "star-pop 0.35s var(--ease-emphasized) both",
        "check-pop": "check-pop 0.28s var(--ease-emphasized) both",
        "check-box-pop": "check-box-pop 0.3s var(--ease-emphasized)",
        "strike-in": "strike-in 0.3s var(--ease-standard) both",
        "number-roll": "number-roll 0.28s var(--ease-emphasized)",
        "amount-flash": "amount-flash 0.9s var(--ease-standard) both",
        "timer-done-pulse": "timer-done-pulse 0.9s var(--ease-emphasized) 3",
        shimmer: "shimmer 1.6s var(--ease-standard) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
