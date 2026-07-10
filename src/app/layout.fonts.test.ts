import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the #182 font-loading optimization at the source level. next/font calls
 * are compiled by an SWC transform and can't be imported into vitest, so instead
 * of executing them we assert the invariants on the layout source:
 *   - exactly one shared body family (Nunito) is preloaded,
 *   - every other family is `preload: false` (loaded on demand per theme),
 *   - every family declares a size-matched fallback + adjustFontFallback,
 *   - every `--font-*` the theme CSS paints is actually declared in the layout.
 * This fails loudly if someone re-introduces eager 5-family preloading or drops a
 * font variable a theme still references.
 */
const layoutSrc = readFileSync(
  resolve(process.cwd(), "src/app/layout.tsx"),
  "utf8",
);
const themesCss = readFileSync(
  resolve(process.cwd(), "src/styles/themes.css"),
  "utf8",
);

/** Options object passed to a given next/font constructor in the layout. */
function fontOptions(constructor: string): string {
  const match = new RegExp(`${constructor}\\(\\{([\\s\\S]*?)\\}\\)`).exec(
    layoutSrc,
  );
  expect(
    match,
    `expected a ${constructor}({...}) call in layout.tsx`,
  ).not.toBeNull();
  return match![1]!;
}

const ON_DEMAND = [
  ["Fraunces", "fraunces"],
  ["Inter", "inter"],
  ["Baloo_2", "baloo"],
  ["JetBrains_Mono", "jetbrains"],
] as const;

describe("theme font loading (#182)", () => {
  it("preloads only the shared body font (Nunito)", () => {
    const nunito = fontOptions("Nunito");
    expect(nunito).toContain("preload: true");
    expect(nunito).not.toContain("preload: false");
  });

  it("loads every display/decorative family on demand (preload: false)", () => {
    for (const [constructor] of ON_DEMAND) {
      expect(fontOptions(constructor)).toContain("preload: false");
    }
  });

  it("gives every family a size-matched fallback + adjustFontFallback", () => {
    for (const constructor of [
      "Fraunces",
      "Nunito",
      "Inter",
      "Baloo_2",
      "JetBrains_Mono",
    ]) {
      const opts = fontOptions(constructor);
      expect(opts, `${constructor} needs a fallback stack`).toContain(
        "fallback:",
      );
      expect(opts, `${constructor} needs adjustFontFallback`).toContain(
        "adjustFontFallback",
      );
    }
  });

  it("declares every font variable the theme CSS actually paints", () => {
    const referenced = new Set(
      Array.from(themesCss.matchAll(/var\(--font-([a-z]+)\)/g)).map(
        (m) => m[1],
      ),
    );
    // Sanity: the CSS really does reference the families we tuned.
    expect(referenced.has("nunito")).toBe(true);
    expect(referenced.has("fraunces")).toBe(true);

    for (const name of referenced) {
      expect(
        layoutSrc,
        `themes.css paints var(--font-${name}) but layout.tsx declares no matching next/font variable`,
      ).toContain(`variable: "--font-${name}"`);
    }
  });
});
