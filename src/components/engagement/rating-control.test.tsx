import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RatingControl } from "./rating-control";
import {
  removeRatingAction,
  setRatingAction,
} from "~/server/engagement/actions";

vi.mock("~/server/engagement/actions", () => ({
  setRatingAction: vi.fn(),
  removeRatingAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const setRating = vi.mocked(setRatingAction);
const removeRating = vi.mocked(removeRatingAction);

const baseProps = {
  recipeId: "recipe_1",
  recipeSlug: "sunday-sauce",
};

beforeEach(() => {
  vi.clearAllMocks();
  setRating.mockResolvedValue({ ok: true });
  removeRating.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe("RatingControl", () => {
  it("renders the aggregate average and count", () => {
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 4.5, count: 10 }}
        viewerRating={null}
        canRate
      />,
    );

    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("10 ratings")).toBeInTheDocument();
  });

  it("shows an empty state when there are no ratings", () => {
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 0, count: 0 }}
        viewerRating={null}
        canRate
      />,
    );

    expect(screen.getByText("No ratings yet")).toBeInTheDocument();
    expect(screen.getByText("Be the first to leave stars.")).toBeInTheDocument();
  });

  it("exposes five keyboard-operable star buttons with accessible labels", () => {
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 0, count: 0 }}
        viewerRating={null}
        canRate
      />,
    );

    expect(
      screen.getByRole("button", { name: "Rate 1 star" }),
    ).toBeEnabled();
    for (const value of [2, 3, 4, 5]) {
      expect(
        screen.getByRole("button", { name: `Rate ${value} stars` }),
      ).toBeInTheDocument();
    }
  });

  it("marks the viewer's current rating with aria-pressed", () => {
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 3, count: 1 }}
        viewerRating={3}
        canRate
      />,
    );

    expect(
      screen.getByRole("button", { name: "Rate 3 stars" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Rate 4 stars" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("disables rating and prompts sign-in when the viewer cannot rate", () => {
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 4, count: 2 }}
        viewerRating={null}
        canRate={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Rate 5 stars" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Sign in to rate this recipe."),
    ).toBeInTheDocument();
  });

  it("optimistically saves a new rating and calls setRatingAction", async () => {
    const user = userEvent.setup();
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 0, count: 0 }}
        viewerRating={null}
        canRate
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rate 4 stars" }));

    await waitFor(() =>
      expect(setRating).toHaveBeenCalledWith({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        value: 4,
      }),
    );
    expect(removeRating).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Your rating: 4. Click it again to clear."),
    ).toBeInTheDocument();
  });

  it("clears the rating when the current star is clicked again", async () => {
    const user = userEvent.setup();
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 3, count: 1 }}
        viewerRating={3}
        canRate
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rate 3 stars" }));

    await waitFor(() =>
      expect(removeRating).toHaveBeenCalledWith({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
      }),
    );
    expect(setRating).not.toHaveBeenCalled();
  });
});
