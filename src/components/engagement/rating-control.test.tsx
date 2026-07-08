import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

  it("exposes the star cluster as a labelled group (1.3.1 / 4.1.2)", () => {
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 4, count: 2 }}
        viewerRating={null}
        canRate
      />,
    );

    const group = screen.getByRole("group", { name: "Recipe rating" });
    expect(group).toBeInTheDocument();
    // All five stars live inside the labelled group.
    for (const value of [1, 2, 3, 4, 5]) {
      const name = value === 1 ? "Rate 1 star" : `Rate ${value} stars`;
      expect(within(group).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("keeps a visible focus ring on every star even when rating is disabled (2.4.7)", () => {
    const { rerender } = render(
      <RatingControl
        {...baseProps}
        summary={{ average: 4, count: 2 }}
        viewerRating={null}
        canRate={false}
      />,
    );

    for (const value of [1, 2, 3, 4, 5]) {
      const name = value === 1 ? "Rate 1 star" : `Rate ${value} stars`;
      const star = screen.getByRole("button", { name });
      expect(star).toBeDisabled();
      expect(star).toHaveClass("focus-visible:ring-2", "focus-visible:ring-ring");
    }

    rerender(
      <RatingControl
        {...baseProps}
        summary={{ average: 4, count: 2 }}
        viewerRating={null}
        canRate
      />,
    );

    const enabledStar = screen.getByRole("button", { name: "Rate 3 stars" });
    expect(enabledStar).toBeEnabled();
    expect(enabledStar).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    );
  });

  it("announces the summary through a polite status region (4.1.3)", () => {
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 4.5, count: 10 }}
        viewerRating={null}
        canRate
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("4.5");
    expect(status).toHaveTextContent("10 ratings");
  });

  it("updates the status region when a rating is submitted (4.1.3)", async () => {
    const user = userEvent.setup();
    render(
      <RatingControl
        {...baseProps}
        summary={{ average: 0, count: 0 }}
        viewerRating={null}
        canRate
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No ratings yet");

    await user.click(screen.getByRole("button", { name: "Rate 4 stars" }));

    await waitFor(() => expect(status).toHaveTextContent("4.0"));
    expect(status).toHaveTextContent("1 rating");
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
