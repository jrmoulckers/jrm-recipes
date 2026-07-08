import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeEditor, type RecipeEditorValue } from "./recipe-editor";

vi.mock("~/server/recipes/actions", () => ({
  createRecipeAction: vi.fn(),
  importRecipeFromUrlAction: vi.fn(),
  updateRecipeAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(cleanup);

// iOS Safari zooms the viewport when a focused control renders below 16px, and
// never zooms back out. Every native <select> in the editor must therefore
// match the Input/Textarea primitives: text-base (16px) on mobile, compact
// text-sm only from md up. The trigger also has to stay a 44px touch target.
function expectNoIosZoom(select: Element) {
  expect(select).toHaveClass("text-base", "md:text-sm", "h-11");
  expect(select).not.toHaveClass("text-sm");
}

describe("RecipeEditor native selects (iOS zoom guard)", () => {
  it("renders the default selects at >=16px on mobile and compact on desktop", () => {
    const { container } = render(<RecipeEditor mode="create" />);
    const selects = Array.from(container.querySelectorAll("select"));

    // Difficulty, Visibility and Status share selectClass and show by default.
    expect(selects).toHaveLength(3);
    for (const select of selects) expectNoIosZoom(select);
  });

  it("keeps the same sizing on the conditional group select", () => {
    const groupInitial: RecipeEditorValue = {
      title: "",
      description: "",
      coverImageUrl: "",
      servings: "4",
      servingsNoun: "servings",
      prepMinutes: "",
      cookMinutes: "",
      difficulty: "",
      cuisine: "",
      sourceName: "",
      sourceUrl: "",
      notes: "",
      visibility: "group",
      status: "published",
      groupId: "g1",
      tags: "",
      ingredients: [],
      steps: [],
    };

    const { container } = render(
      <RecipeEditor
        mode="create"
        initial={groupInitial}
        groups={[{ id: "g1", name: "Family" }]}
      />,
    );
    const selects = Array.from(container.querySelectorAll("select"));

    // Group visibility reveals the fourth select (Difficulty, Visibility,
    // Group, Status) — all four are guarded.
    expect(selects).toHaveLength(4);
    for (const select of selects) expectNoIosZoom(select);
  });
});
