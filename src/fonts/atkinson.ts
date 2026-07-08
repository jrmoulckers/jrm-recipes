import localFont from "next/font/local";

/**
 * Atkinson Hyperlegible — a hyperlegible typeface from the Braille Institute,
 * designed so letterforms that normally blur together (I / l / 1, o / c / e)
 * stay distinct. It powers the "Easy-reading text" accessibility preference.
 *
 * Self-hosted (OFL-1.1 — see ./atkinson-hyperlegible/OFL.txt) via next/font so
 * the typeface actually ships with the app and works offline in the PWA, rather
 * than assuming the reader already has it installed. Exposed as the
 * `--font-atkinson` CSS variable, which the [data-reading="readable"] block in
 * src/styles/a11y.css maps onto --font-body / --font-display.
 */
export const atkinson = localFont({
  variable: "--font-atkinson",
  display: "swap",
  src: [
    {
      path: "./atkinson-hyperlegible/AtkinsonHyperlegible-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./atkinson-hyperlegible/AtkinsonHyperlegible-Italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./atkinson-hyperlegible/AtkinsonHyperlegible-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./atkinson-hyperlegible/AtkinsonHyperlegible-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
});
