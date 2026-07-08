import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ListRowSkeleton,
  RecipeCardSkeleton,
  Skeleton,
} from "./skeleton";

afterEach(cleanup);

describe("Skeleton", () => {
  it("renders a token surface base with a shimmer band by default", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const base = container.firstElementChild as HTMLElement;
    expect(base.className).toContain("bg-muted");
    expect(base.className).toContain("relative");
    expect(base.className).toContain("overflow-hidden");

    const band = container.querySelector("[data-skeleton-shimmer]");
    expect(band).not.toBeNull();
    expect(band).toHaveAttribute("aria-hidden", "true");
    expect(band!.className).toContain("animate-shimmer");
  });

  it("builds the shimmer from tokens, never hex literals", () => {
    const { container } = render(<Skeleton />);
    const band = container.querySelector("[data-skeleton-shimmer]")!;
    expect(band.className).toContain("via-foreground/10");
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(container.innerHTML).not.toContain("style=");
  });

  it("drops the shimmer band when shimmer is disabled", () => {
    const { container } = render(<Skeleton shimmer={false} />);
    expect(container.querySelector("[data-skeleton-shimmer]")).toBeNull();
  });

  it("merges custom classes onto the base block", () => {
    const { container } = render(<Skeleton className="rounded-none" />);
    const base = container.firstElementChild as HTMLElement;
    expect(base.className).toContain("rounded-none");
  });
});

describe("composed skeletons", () => {
  it("RecipeCardSkeleton mirrors the card surface with several blocks", () => {
    const { container } = render(<RecipeCardSkeleton />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("border-border");
    // image + 3 text lines + 3 meta chips = 7 skeleton blocks.
    expect(container.querySelectorAll("[data-skeleton-shimmer]")).toHaveLength(7);
  });

  it("ListRowSkeleton mirrors a media-and-text row", () => {
    const { container } = render(<ListRowSkeleton />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("bg-card");
    // avatar + 3 text lines = 4 skeleton blocks.
    expect(container.querySelectorAll("[data-skeleton-shimmer]")).toHaveLength(4);
  });
});
