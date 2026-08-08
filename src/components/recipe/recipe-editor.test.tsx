import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { RecipeEditor, type RecipeEditorValue } from "./recipe-editor";
import type { ReactElement } from "react";
import { IntlWrapper } from "~/test/intl";

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

vi.mock("~/server/recipes/actions", () => ({
  createRecipeAction: vi.fn(),
  importRecipeFromUrlAction: vi.fn(),
  updateRecipeAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Radix Popover (the visibility settings popdown) relies on pointer-capture +
// scrollIntoView, absent in jsdom.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

const EDITOR_TEST_TIMEOUT_MS = 15_000;

// iOS Safari zooms the viewport when a focused control renders below 16px, and
// never zooms back out. Every native <select> in the editor must therefore
// match the Input/Textarea primitives: text-base (16px) on mobile, compact
// text-sm only from md up. The trigger also has to stay a 44px touch target.
function expectNoIosZoom(select: Element) {
  expect(select).toHaveClass("text-base", "md:text-sm", "h-11");
  expect(select).not.toHaveClass("text-sm");
}

describe("RecipeEditor view toggle", () => {
  it(
    "uses the shared segmented-control states when switching views",
    async () => {
      const user = userEvent.setup();
      render(<RecipeEditor mode="create" />);

      const edit = screen.getByRole("button", { name: "Edit" });
      const preview = screen.getByRole("button", { name: "Preview" });

      expect(edit).toHaveAttribute("data-state", "on");
      expect(preview).toHaveAttribute("data-state", "off");

      await user.click(preview);

      expect(edit).toHaveAttribute("data-state", "off");
      expect(preview).toHaveAttribute("data-state", "on");
    },
    EDITOR_TEST_TIMEOUT_MS,
  );
});

// Visibility + Status now live behind a "Visibility settings" popdown, so the
// guard tests open it to reach those selects (they portal to document.body).
async function openVisibilityPopdown(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /visibility settings/i }),
  );
  await screen.findByLabelText("Who can see this?");
}

describe("RecipeEditor native selects (iOS zoom guard)", () => {
  it(
    "renders the default selects at >=16px on mobile and compact on desktop",
    async () => {
      const user = userEvent.setup();
      render(<RecipeEditor mode="create" />);
      await openVisibilityPopdown(user);

      // Difficulty (main form) plus the per-row ingredient Group and step Section
      // selects, plus Visibility and Status revealed by the popdown (#425). The
      // iOS zoom guard below must hold for every one of them.
      const selects = Array.from(document.querySelectorAll("select"));
      expect(selects.length).toBeGreaterThanOrEqual(4);
      for (const select of selects) expectNoIosZoom(select);
    },
    EDITOR_TEST_TIMEOUT_MS,
  );

  it(
    "keeps the same sizing on the conditional group select",
    async () => {
      const groupInitial: RecipeEditorValue = {
        title: "",
        description: "",
        coverImageUrl: "",
        servings: "4",
        servingsNoun: "servings",
        prepMinutes: "",
        cookMinutes: "",
        calories: "",
        proteinGrams: "",
        carbsGrams: "",
        fatGrams: "",
        saturatedFatGrams: "",
        sodiumMg: "",
        sugarGrams: "",
        fiberGrams: "",
        difficulty: "",
        cuisine: "",
        sourceName: "",
        sourceUrl: "",
        notes: "",
        visibility: "group",
        status: "published",
        groupId: "g1",
        tags: "",
        dietaryFlags: [],
        ingredients: [],
        steps: [],
      };

      const user = userEvent.setup();
      render(
        <RecipeEditor
          mode="create"
          initial={groupInitial}
          groups={[{ id: "g1", name: "Family" }]}
        />,
      );
      await openVisibilityPopdown(user);

      // Group visibility reveals the conditional Group select inside the popdown
      // alongside Visibility and Status. Difficulty stays in the main form. Every
      // one of them is guarded.
      const selects = Array.from(document.querySelectorAll("select"));
      expect(selects.length).toBeGreaterThanOrEqual(4);
      for (const select of selects) expectNoIosZoom(select);
    },
    EDITOR_TEST_TIMEOUT_MS,
  );
});
