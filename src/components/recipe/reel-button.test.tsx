import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CreateReelButton } from "./reel-button";
import { type ReelRecipe } from "~/lib/reel/scenes";
import type { ReactElement } from "react";
import { IntlWrapper } from "~/test/intl";

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

afterEach(() => cleanup());

const reel: ReelRecipe = {
  title: "Sourdough",
  ingredients: [],
  steps: [],
};

const buttonSrc = readFileSync(
  resolve(process.cwd(), "src/components/recipe/reel-button.tsx"),
  "utf8",
);

/**
 * The renderer module the trigger must never statically import (#729).
 *
 * A negative assertion over source text passes whenever the string is absent,
 * and a misspelled string is always absent — so on its own this one could be
 * turned into a permanent no-op by a typo. The positive assertion beside it is
 * no anchor, because a static import of the renderer coexists happily with the
 * dynamic import of the studio; that coexistence *is* the regression.
 *
 * So the literal is anchored to the module it actually names. A typo fails on
 * the file check rather than passing quietly, and the two failures say
 * different things: the module moved, or the string is wrong.
 */
const RENDERER_MODULE = "reel/renderer";

describe("CreateReelButton code-splitting (#200)", () => {
  it("names a renderer module that exists, so the ban below cannot rot", () => {
    expect(
      existsSync(
        resolve(process.cwd(), `src/components/recipe/${RENDERER_MODULE}.ts`),
      ),
      `"${RENDERER_MODULE}" names no module, so the check that bans it can never fire. If the renderer moved, update this constant; if the path is misspelled, fix it.`,
    ).toBe(true);
  });

  it("loads the reel studio as a dynamic chunk and never statically imports the renderer", () => {
    expect(buttonSrc).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\("\.\/reel-studio"\)/,
    );
    // The heavy canvas/MediaRecorder renderer must not be pulled into the
    // trigger's (initial-bundle) module.
    expect(buttonSrc).not.toContain(RENDERER_MODULE);
  });

  it("renders only the lightweight trigger until the dialog is opened", () => {
    render(<CreateReelButton reel={reel} />);

    // The trigger button ships in the initial bundle…
    expect(screen.getByRole("button", { name: /reel/i })).toBeInTheDocument();
    // …but the studio (title + export controls) isn't mounted while closed, so
    // its chunk is never requested on load.
    expect(screen.queryByText("Share as a Reel")).toBeNull();
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
  });
});
