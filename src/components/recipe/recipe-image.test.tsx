import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { recipeFallbackImage } from "~/lib/recipe-image-fallback";

import { RecipeImage } from "./recipe-image";

function decodedSrc(image: HTMLImageElement): string {
  return decodeURIComponent(image.getAttribute("src") ?? "");
}

describe("RecipeImage", () => {
  it("renders the stable local fallback when no cover is provided", () => {
    const { container } = render(
      <RecipeImage
        src={null}
        fallbackKey="recipe-without-cover"
        alt=""
        width={640}
        height={400}
      />,
    );
    const image = container.querySelector("img")!;

    expect(decodedSrc(image)).toContain(
      recipeFallbackImage("recipe-without-cover"),
    );
    expect(image).toHaveAttribute("data-fallback");
  });

  it("replaces a failed remote cover with the local fallback", () => {
    const { container } = render(
      <RecipeImage
        src="https://example.test/missing-cover.jpg"
        fallbackKey="recipe-with-broken-cover"
        alt=""
        width={640}
        height={400}
      />,
    );
    const image = container.querySelector("img")!;

    expect(decodedSrc(image)).toContain("missing-cover.jpg");
    fireEvent.error(image);
    expect(decodedSrc(image)).toContain(
      recipeFallbackImage("recipe-with-broken-cover"),
    );
    expect(image).toHaveAttribute("data-fallback");
  });

  it("uses the fallback before rendering a malformed draft URL", () => {
    const { container } = render(
      <RecipeImage
        src="example.com/incomplete-draft.jpg"
        fallbackKey="draft-recipe"
        alt=""
        width={640}
        height={400}
      />,
    );
    const image = container.querySelector("img")!;

    expect(image.getAttribute("src")).toContain(
      recipeFallbackImage("draft-recipe"),
    );
    expect(image).toHaveAttribute("data-fallback");
  });

  it("hides unavailable instructional imagery instead of mislabeling a fallback", () => {
    const { container } = render(
      <RecipeImage
        src="https://example.test/missing-step.jpg"
        fallbackKey="recipe-step-2"
        fallbackMode="hide"
        alt="Step 2 visual"
        width={640}
        height={400}
      />,
    );
    const image = container.querySelector("img")!;

    fireEvent.error(image);
    expect(container.querySelector("img")).toBeNull();
  });
});
