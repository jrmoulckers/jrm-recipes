import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CreateReelButton } from "./reel-button";
import { type ReelRecipe } from "~/lib/reel/scenes";

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

describe("CreateReelButton code-splitting (#200)", () => {
  it("loads the reel studio as a dynamic chunk and never statically imports the renderer", () => {
    expect(buttonSrc).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\("\.\/reel-studio"\)/,
    );
    // The heavy canvas/MediaRecorder renderer must not be pulled into the
    // trigger's (initial-bundle) module.
    expect(buttonSrc).not.toContain("reel/renderer");
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
